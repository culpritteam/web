import { describe, expect, it } from 'vitest';
import { createProjectService } from '../project.service';
import type { ProjectRepository } from '../project.repository';
import type { AuditContext, Project } from '../project.types';

const SILENT_LOGGER = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
const NOW = new Date('2026-09-12T00:00:00Z');

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj_1',
    teamMemberId: 'mem_1',
    title: 'Lab website',
    summary: 'The public site and the admin app behind it.',
    link: null,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

class FakeRepository implements ProjectRepository {
  store = new Map<string, Project>();
  audits: (AuditContext & { entityId: string })[] = [];
  private seq = 0;

  seed(project: Project) {
    this.store.set(project.id, { ...project });
  }

  async findById(id: string) {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async listForMember(teamMemberId: string) {
    return [...this.store.values()]
      .filter((project) => project.teamMemberId === teamMemberId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async stats() {
    return { total: this.store.size };
  }

  async createWithAudit(input: { data: Partial<Project>; audit: AuditContext }) {
    const id = `proj_${++this.seq}`;
    const project = makeProject({ ...input.data, id });
    this.store.set(id, project);
    this.audits.push({ ...input.audit, entityId: id });
    return { ...project };
  }

  async updateWithAudit(input: { id: string; data: Partial<Project>; audit: AuditContext }) {
    const current = this.store.get(input.id);
    if (!current) throw new Error('not found');
    const updated = { ...current, ...input.data };
    this.store.set(input.id, updated);
    this.audits.push({ ...input.audit, entityId: input.id });
    return { ...updated };
  }

  async deleteWithAudit(input: { id: string; audit: AuditContext }) {
    this.store.delete(input.id);
    this.audits.push({ ...input.audit, entityId: input.id });
  }
}

function build() {
  const repository = new FakeRepository();
  return { repository, service: createProjectService({ repository, logger: SILENT_LOGGER }) };
}

describe('project service', () => {
  it('creates a project and writes an audit row', async () => {
    const { repository, service } = build();

    const result = await service.create(
      { teamMemberId: 'mem_1', title: 'Lab website', summary: 'The site.' },
      'admin:1',
    );

    expect(result.ok).toBe(true);
    expect(repository.audits[0]).toMatchObject({ actor: 'admin:1', action: 'project.create' });
  });

  it('is allowed for every team — the service has no team rule of its own', async () => {
    // Projects are the one content section all four teams share, so nothing here consults a team
    // lookup the way the teaching service does.
    const { service } = build();

    const result = await service.create(
      { teamMemberId: 'any-member', title: 'Anything', summary: 'For any team.' },
      'admin:1',
    );

    expect(result.ok).toBe(true);
  });

  it("returns only the given member's projects, in sort order", async () => {
    const { repository, service } = build();
    repository.seed(makeProject({ id: 'b', sortOrder: 2 }));
    repository.seed(makeProject({ id: 'a', sortOrder: 1 }));
    repository.seed(makeProject({ id: 'x', teamMemberId: 'mem_2' }));

    const result = await service.listForMember('mem_1');

    expect(result.ok && result.data.map((project) => project.id)).toEqual(['a', 'b']);
  });

  it('records the full before-state when deleting', async () => {
    const { repository, service } = build();
    repository.seed(
      makeProject({ id: 'proj_9', title: 'Retired tool', link: 'https://example.org/tool' }),
    );

    const result = await service.remove('proj_9', 'admin:1');

    expect(result.ok && result.data.id).toBe('proj_9');
    expect(repository.store.has('proj_9')).toBe(false);
    expect(repository.audits[0]).toMatchObject({
      action: 'project.delete',
      metadata: {
        teamMemberId: 'mem_1',
        title: 'Retired tool',
        link: 'https://example.org/tool',
      },
    });
  });

  it('refuses to update or delete an id that does not exist', async () => {
    const { repository, service } = build();

    const update = await service.update('missing', { title: 'x' }, 'admin:1');
    const remove = await service.remove('missing', 'admin:1');

    expect(update.ok).toBe(false);
    if (!update.ok) expect(update.error.kind).toBe('not_found');
    expect(remove.ok).toBe(false);
    expect(repository.audits).toEqual([]);
  });

  it('stats() counts the projects without listing them', async () => {
    const { repository, service } = build();
    repository.seed(makeProject({ id: 'a' }));
    repository.seed(makeProject({ id: 'b' }));

    const result = await service.stats();

    expect(result.ok && result.data).toEqual({ total: 2 });
  });
});
