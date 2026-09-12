import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemberLinksField, type MemberLinkRow } from '../ui/member-links-field';

function Harness({ initial = [] as MemberLinkRow[] }) {
  const [value, setValue] = useState<MemberLinkRow[]>(initial);
  return <MemberLinksField value={value} onChange={setValue} />;
}

/** The rows as the admin sees them: [label, url] per list item. */
const rows = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((item) => [...item.querySelectorAll('input')].map((input) => input.value));

describe('MemberLinksField', () => {
  it('adds, edits, reorders and removes rows', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText(/No links yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.type(screen.getByLabelText('Link 1 label'), 'GitHub');
    await user.type(screen.getByLabelText('Link 1 URL'), 'https://github.com/kai');

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    await user.type(screen.getByLabelText('Link 2 label'), 'ORCID');
    await user.type(screen.getByLabelText('Link 2 URL'), 'https://orcid.org/1');
    expect(rows()).toEqual([
      ['GitHub', 'https://github.com/kai'],
      ['ORCID', 'https://orcid.org/1'],
    ]);

    // Buttons are named by the row's label, not its position, so the order IS the stored order.
    await user.click(screen.getByRole('button', { name: 'Move ORCID up' }));
    expect(rows()).toEqual([
      ['ORCID', 'https://orcid.org/1'],
      ['GitHub', 'https://github.com/kai'],
    ]);

    await user.click(screen.getByRole('button', { name: 'Remove GitHub' }));
    expect(rows()).toEqual([['ORCID', 'https://orcid.org/1']]);
  });

  it('names an unlabelled row by its position so its buttons stay distinguishable', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('button', { name: 'Remove link 1' })).toBeInTheDocument();
  });

  it('stops at twenty rows and says why', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={Array.from({ length: 20 }, (_, i) => ({
          label: `Link ${i + 1}`,
          url: `https://example.com/${i}`,
        }))}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('20 links is the maximum');

    await user.click(screen.getByRole('button', { name: 'Remove Link 1' }));
    expect(screen.getByRole('button', { name: 'Add link' })).toBeEnabled();
  });

  it('links a row error to the input it belongs to', () => {
    render(
      <MemberLinksField
        value={[{ label: 'GitHub', url: 'nope' }]}
        onChange={() => {}}
        errors={[{ url: 'Must be a valid URL.' }]}
      />,
    );

    const url = screen.getByLabelText('Link 1 URL');
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(url.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Must be a valid URL.',
    );
    expect(screen.getByLabelText('Link 1 label')).toHaveAttribute('aria-invalid', 'false');
  });
});
