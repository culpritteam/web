import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every mutating repository writes its `AuditLog` row inside the SAME transaction as the mutation,
// so a write can never land without its audit trail. Prisma is faked here — no database — so what
// is asserted is the order and scope of the calls made on the transaction client.

const calls: string[] = [];
const row = {
  id: 'proj_1',
  teamMemberId: 'mem_1',
  title: 'Lab website',
  summary: 'The site.',
  link: null,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const tx = {
  project: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      calls.push('create');
      return { ...row, ...data };
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push('update');
        return { ...row, id: where.id, ...data };
      },
    ),
    delete: vi.fn(async () => {
      calls.push('delete');
      return row;
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

const { PrismaProjectRepository } = await import('../project.repository');

const AUDIT = { actor: 'admin:1', action: 'project.create' };

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe('PrismaProjectRepository', () => {
  it('writes the audit row in the same transaction as the create', async () => {
    await new PrismaProjectRepository().createWithAudit({
      data: { teamMemberId: 'mem_1', title: 'Lab website', summary: 'The site.' },
      audit: AUDIT,
    });

    expect(calls).toEqual(['create', 'audit']);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityType: 'project', entityId: 'proj_1' }),
    });
  });

  it('defaults the optional columns rather than writing undefined', async () => {
    await new PrismaProjectRepository().createWithAudit({
      data: { teamMemberId: 'mem_1', title: 'Lab website', summary: 'The site.' },
      audit: AUDIT,
    });

    expect(tx.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ link: null, sortOrder: 0 }),
    });
  });

  it('leaves absent keys untouched on an update — an absent key is not a cleared column', async () => {
    await new PrismaProjectRepository().updateWithAudit({
      id: 'proj_1',
      data: { title: 'Renamed' },
      audit: { ...AUDIT, action: 'project.update' },
    });

    expect(calls).toEqual(['update', 'audit']);
    expect(tx.project.update).toHaveBeenCalledWith({
      where: { id: 'proj_1' },
      data: { title: 'Renamed', summary: undefined, link: undefined, sortOrder: undefined },
    });
  });

  it('writes the audit row in the same transaction as the delete', async () => {
    await new PrismaProjectRepository().deleteWithAudit({
      id: 'proj_1',
      audit: { ...AUDIT, action: 'project.delete', metadata: { title: 'Lab website' } },
    });

    expect(calls).toEqual(['delete', 'audit']);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'project.delete',
        metadata: { title: 'Lab website' },
      }),
    });
  });
});
