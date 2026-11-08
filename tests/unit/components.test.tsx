// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { PageRangeField } from '../../src/components/tool/helpers';
import { Segmented, Switch } from '../../src/components/ui/Form';
import { Alert } from '../../src/components/ui/Feedback';
import { ErrorPanel } from '../../src/components/tool/TaskPanels';
import { PdfToolError } from '../../src/pdf/errors';
import { PageGrid, type GridPage } from '../../src/components/tool/PageGrid';

afterEach(cleanup);

function RangeHarness() {
  const [v, setV] = useState('');
  return <PageRangeField value={v} onChange={setV} pageCount={5} />;
}

describe('PageRangeField', () => {
  it('validates on blur and shows a helpful error', () => {
    render(<RangeHarness />);
    const input = screen.getByLabelText('Pages');
    fireEvent.change(input, { target: { value: '2-9' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Page 9 doesn’t exist');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(input, { target: { value: '2-4' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Segmented', () => {
  it('is a keyboard-operable radio group', () => {
    const onChange = vi.fn();
    render(<Segmented label="Format" value="png" onChange={onChange} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }]} />);
    const group = screen.getByRole('radiogroup', { name: 'Format' });
    const png = screen.getByRole('radio', { name: 'PNG' });
    expect(png.getAttribute('aria-checked')).toBe('true');
    expect(png.tabIndex).toBe(0);
    expect(screen.getByRole('radio', { name: 'JPEG' }).tabIndex).toBe(-1);
    fireEvent.keyDown(png, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('jpeg');
    expect(group).toBeTruthy();
  });
});

describe('Switch', () => {
  it('toggles with an accessible switch role', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Remember recent tasks" />);
    const sw = screen.getByRole('switch', { name: 'Remember recent tasks' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('error presentation', () => {
  it('renders hostile file names as text, not HTML', () => {
    render(<ErrorPanel error={new PdfToolError('NOT_PDF', 'x', '<img src=x onerror=alert(1)>.pdf')} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByTestId('error-message').textContent).toContain('<img src=x onerror=alert(1)>.pdf');
  });
  it('alerts use the right live-region role', () => {
    render(<Alert tone="danger" title="Bad">x</Alert>);
    expect(screen.getByRole('alert').textContent).toContain('Bad');
  });
});

describe('PageGrid', () => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const pages = (fileOf: (i: number) => number): GridPage[] =>
    Array.from({ length: 4 }, (_, i) => ({
      key: `k${i}`,
      docId: 'doc',
      pageIndex: i,
      rotation: 0,
      label: `Page ${i + 1}`,
      badgeKey: String(fileOf(i)),
      badge: <span data-testid={`badge-${i}`}>File {fileOf(i)}</span>,
    }));

  it('updates a badge when its badgeKey changes (memoized cards)', () => {
    const { rerender } = render(<PageGrid pages={pages((i) => i + 1)} selected={new Set()} selectable={false} />);
    expect(screen.getByTestId('badge-3').textContent).toBe('File 4');
    rerender(<PageGrid pages={pages((i) => Math.floor(i / 2) + 1)} selected={new Set()} selectable={false} />);
    expect(screen.getByTestId('badge-3').textContent).toBe('File 2');
  });

  it('keeps page actions outside the selectable card surface (no nested controls)', () => {
    render(<PageGrid pages={pages(() => 1)} selected={new Set(['k1'])} onSelect={() => undefined} actions={(p) => <button type="button">Rotate {p.label}</button>} />);
    const surface = screen.getAllByRole('checkbox')[1]!;
    expect(surface.getAttribute('aria-checked')).toBe('true');
    expect(surface.querySelector('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Rotate Page 2' })).toBeTruthy();
  });
});
