import { beforeEach, describe, expect, it, vi } from 'vitest';

// The one-director rule lives in the repository: the write that makes someone director must first
// clear the flag everywhere else, inside the same transaction, or the partial unique index
// `team_member_one_director` rejects it. Prisma is faked here — no database — so what is asserted is
// the order and scope of the calls made on the transaction client.

const calls: string[] = [];
const tx = {
  teamMember: {
    updateMany: vi.fn(async (args: unknown) => {
      calls.push('updateMany');
      return { count: 1, args };
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      calls.push('create');
      return { id: 'new', createdAt: new Date(), updatedAt: new Date(), ...data };
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push('update');
        return { id: where.id, createdAt: new Date(), updatedAt: new Date(), ...data };
      },
    ),
  },
  memberLink: {
    deleteMany: vi.fn(async () => {
      calls.push('links.deleteMany');
      return { count: 1 };
    }),
    createMany: vi.fn(async (args: unknown) => {
      calls.push('links.createMany');
      return { count: 1, args };
    }),
  },
  auditLog: {
    create: vi.fn(async () => {
      calls.push('audit');
    }),
  },
};

vi.mock('@/modules/shared/lib/prisma', () => ({
  prisma: { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) },
}));

const { PrismaTeamMemberRepository } = await import('../team-member.repository');

const AUDIT = { actor: 'admin:1', action: 'team_member.update' };

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe('PrismaTeamMemberRepository director handling', () => {
  it('clears every other director before updating one to director, in the same transaction', async () => {
    await new PrismaTeamMemberRepository().updateWithAudit({
      id: 'second',
      data: { isDirector: true },
      audit: AUDIT,
    });

    expect(calls).toEqual(['updateMany', 'update', 'audit']);
    expect(tx.teamMember.updateMany).toHaveBeenCalledWith({
      where: { isDirector: true, id: { not: 'second' } },
      data: { isDirector: false },
    });
  });

  it('clears the existing director before creating a new one', async () => {
    await new PrismaTeamMemberRepository().createWithAudit({
      data: {
        name: 'New',
        role: 'Professor',
        teamKind: 'director',
        isDirector: true,
        links: [],
      },
      audit: { ...AUDIT, action: 'team_member.create' },
    });

    expect(calls).toEqual(['updateMany', 'create', 'audit']);
    expect(tx.teamMember.updateMany).toHaveBeenCalledWith({
      where: { isDirector: true },
      data: { isDirector: false },
    });
  });

  it('leaves other members alone when the write does not set the flag', async () => {
    await new PrismaTeamMemberRepository().updateWithAudit({
      id: 'someone',
      data: { name: 'Renamed' },
      audit: AUDIT,
    });
    await new PrismaTeamMemberRepository().updateWithAudit({
      id: 'someone',
      data: { isDirector: false },
      audit: AUDIT,
    });

    expect(tx.teamMember.updateMany).not.toHaveBeenCalled();
  });
});

// Links are part of the member aggregate, like a publication's byline rows: the payload carries the
// whole list and the repository replaces it inside the member's own transaction, next to the audit
// entry. An absent key leaves the stored list alone.
describe('PrismaTeamMemberRepository links', () => {
  it('replaces the whole list inside the same transaction as the member write', async () => {
    await new PrismaTeamMemberRepository().updateWithAudit({
      id: 'mem_1',
      data: { links: [{ label: 'GitHub', url: 'https://github.com/example' }] },
      audit: AUDIT,
    });

    expect(calls).toEqual(['update', 'links.deleteMany', 'links.createMany', 'audit']);
    expect(tx.memberLink.deleteMany).toHaveBeenCalledWith({ where: { teamMemberId: 'mem_1' } });
    expect(tx.memberLink.createMany).toHaveBeenCalledWith({
      data: [
        {
          teamMemberId: 'mem_1',
          label: 'GitHub',
          url: 'https://github.com/example',
          sortOrder: 0,
        },
      ],
    });
  });

  it('numbers sortOrder from the array order', async () => {
    await new PrismaTeamMemberRepository().updateWithAudit({
      id: 'mem_1',
      data: {
        links: [
          { label: 'LinkedIn', url: 'https://www.linkedin.com/in/example' },
          { label: 'ORCID', url: 'https://orcid.org/0000-0000-0000-0000' },
        ],
      },
      audit: AUDIT,
    });

    const [{ data }] = tx.memberLink.createMany.mock.calls[0] as [
      { data: { sortOrder: number }[] },
    ];
    expect(data.map((link) => link.sortOrder)).toEqual([0, 1]);
  });

  it('clears the list when an empty array arrives', async () => {
    await new PrismaTeamMemberRepository().updateWithAudit({
      id: 'mem_1',
      data: { links: [] },
      audit: AUDIT,
    });

    expect(tx.memberLink.deleteMany).toHaveBeenCalledWith({ where: { teamMemberId: 'mem_1' } });
    expect(tx.memberLink.createMany).toHaveBeenCalledWith({ data: [] });
  });

  it('leaves the list alone when the update does not mention it', async () => {
    await new PrismaTeamMemberRepository().updateWithAudit({
      id: 'mem_1',
      data: { name: 'Renamed' },
      audit: AUDIT,
    });

    expect(tx.memberLink.deleteMany).not.toHaveBeenCalled();
    expect(tx.memberLink.createMany).not.toHaveBeenCalled();
  });

  it('creates the links with the member in one transaction', async () => {
    await new PrismaTeamMemberRepository().createWithAudit({
      data: {
        name: 'New',
        role: 'Developer',
        teamKind: 'development',
        links: [{ label: 'GitHub', url: 'https://github.com/example' }],
      },
      audit: { ...AUDIT, action: 'team_member.create' },
    });

    expect(calls).toEqual(['create', 'audit']);
    const [{ data }] = tx.teamMember.create.mock.calls[0] as [
      { data: { links: { create: { label: string; sortOrder: number }[] } } },
    ];
    expect(data.links.create).toEqual([
      { label: 'GitHub', url: 'https://github.com/example', sortOrder: 0 },
    ]);
  });
});
