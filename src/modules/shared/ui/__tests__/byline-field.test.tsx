import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bylineSuggestions } from '@/modules/research-groups/byline-match';
import { BylineField, type BylineEntry } from '../byline-field';

function Harness({ initial = [] as BylineEntry[], onChange = vi.fn() }) {
  const [value, setValue] = useState<BylineEntry[]>(initial);
  return (
    <BylineField
      label="Authors"
      emptyHint="No authors listed."
      suggestions={['Jane Jaimunk', 'J. Jaimunk']}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const names = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('p')?.textContent);

describe('BylineField', () => {
  it('offers member names as native datalist suggestions', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Add a name');
    const list = document.getElementById(input.getAttribute('list')!);
    expect(list?.tagName).toBe('DATALIST');
    expect([...list!.querySelectorAll('option')].map((o) => o.value)).toEqual([
      'Jane Jaimunk',
      'J. Jaimunk',
    ]);
  });

  it('adds a typed name on Enter without submitting, then reorders and removes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('No authors listed.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Add a name'), 'A. Author{Enter}');
    await user.type(screen.getByLabelText('Add a name'), 'J. Jaimunk');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(names()).toEqual(['A. Author', 'J. Jaimunk']);

    await user.click(screen.getByRole('button', { name: 'Move J. Jaimunk up' }));
    expect(names()).toEqual(['J. Jaimunk', 'A. Author']);

    await user.click(screen.getByRole('button', { name: 'Remove A. Author' }));
    expect(names()).toEqual(['J. Jaimunk']);
  });
});

describe('bylineSuggestions', () => {
  it('lists each name and name-on-papers once', () => {
    expect(
      bylineSuggestions([
        { name: 'Jane Jaimunk', citationName: 'J. Jaimunk' },
        { name: 'Alex Kim', citationName: null },
        { name: 'Alex Kim', citationName: null },
      ]),
    ).toEqual(['Jane Jaimunk', 'J. Jaimunk', 'Alex Kim']);
  });
});
