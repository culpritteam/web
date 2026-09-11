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
      data: { name: 'New', role: 'Professor', isDirector: true },
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
