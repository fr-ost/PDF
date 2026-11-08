import { useState } from 'react';
import { Monitor, Moon, Settings as SettingsIcon, Sun, Trash2 } from 'lucide-react';
import { resetSettings, updateSettings, useSettings } from '../../services/settings-service/settings';
import { clearHistory, useHistory } from '../../services/history-service/history';
import { resetReviewPrompt } from '../../services/support/reviewPrompt';
import { DeveloperLink } from '../../components/Developer';
import { COMPRESSION_PRESETS } from '../../pdf/compressionPresets';
import { PAPER_SIZES, type PaperSize } from '../../pdf/paper';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Field, Segmented, Select, Slider, Switch } from '../../components/ui/Form';
import { useToast } from '../../components/ui/Toast';
import { setTheme } from '../theme';
import { BrandMark } from '../../components/BrandMark';

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="enter p-6">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      <div className="mt-4 space-y-5">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const s = useSettings();
  const history = useHistory();
  const toast = useToast();
  const [confirm, setConfirm] = useState<'history' | 'all' | null>(null);
  const hasPicker = typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
      <PageHeader title="Settings" description="Preferences are saved in this browser only." icon={<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-fg-muted shadow-card"><SettingsIcon size={20} aria-hidden /></span>} />
      <div className="h-2" />

      <Group title="Appearance">
        <Field label="Theme">
          <Segmented
            label="Theme"
            value={s.theme}
            onChange={(theme) => setTheme(theme)}
            options={[
              { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor size={14} aria-hidden /> System</span> },
              { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={14} aria-hidden /> Light</span> },
              { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={14} aria-hidden /> Dark</span> },
            ]}
          />
        </Field>
      </Group>

      <Group title="Defaults" description="Starting values for tools. You can still change them each time.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Image export format" htmlFor="s-format">
            <Select id="s-format" value={s.imageFormat} onChange={(e) => void updateSettings({ imageFormat: e.target.value as 'png' | 'jpeg' })}>
              <option value="png">PNG (lossless)</option>
              <option value="jpeg">JPEG (smaller)</option>
            </Select>
          </Field>
          <Field label="Image export resolution" htmlFor="s-dpi">
            <Select id="s-dpi" value={s.imageDpi} onChange={(e) => void updateSettings({ imageDpi: Number(e.target.value) })}>
              {[72, 96, 150, 200, 300, 600].map((d) => (
                <option key={d} value={d}>{d} DPI</option>
              ))}
            </Select>
          </Field>
          <Field label="Default page size" htmlFor="s-size" hint="Used by Images to PDF.">
            <Select id="s-size" value={s.pageSize} onChange={(e) => void updateSettings({ pageSize: e.target.value as PaperSize })}>
              {Object.entries(PAPER_SIZES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Compression level" htmlFor="s-comp">
            <Select id="s-comp" value={s.compressionLevel} onChange={(e) => void updateSettings({ compressionLevel: e.target.value as keyof typeof COMPRESSION_PRESETS })}>
              <option value="low">Light — best quality</option>
              <option value="balanced">Balanced — recommended</option>
              <option value="high">Strong — smallest size</option>
            </Select>
          </Field>
        </div>
        <Slider label="JPEG quality" min={0.5} max={1} step={0.05} value={s.jpegQuality} onChange={(v) => void updateSettings({ jpegQuality: v })} format={(v) => `${Math.round(v * 100)}%`} />
      </Group>

      <Group title="Saving files">
        <Switch
          checked={s.askWhereToSave && hasPicker}
          disabled={!hasPicker}
          onChange={(v) => void updateSettings({ askWhereToSave: v })}
          label="Ask where to save each file"
          description={hasPicker ? 'Shows a “Save as” dialog instead of saving to your Downloads folder.' : 'Not available in this browser.'}
        />
      </Group>

      <Group title="Privacy and local data" description="Unique PDF never uploads files. The only data it keeps is listed here.">
        <Switch checked={s.historyEnabled} onChange={(v) => void updateSettings({ historyEnabled: v })} label="Remember recent tasks" description="File names and sizes only, never file contents." />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Trash2} disabled={history.length === 0} onClick={() => setConfirm('history')}>
            Clear history ({history.length})
          </Button>
          <Button variant="secondary" icon={Trash2} onClick={() => setConfirm('all')} data-testid="clear-all-data">
            Clear all local data
          </Button>
        </div>
        <p className="text-[12.5px] text-fg-subtle">
          Read the <a href="#/privacy" className="font-medium text-primary hover:underline">privacy details</a>.
        </p>
      </Group>

      <Group title="About">
        <div className="flex items-center justify-between gap-4">
          <BrandMark />
          <div className="flex flex-col items-end gap-1 text-right text-sm text-fg-muted">
            <p>Version {__APP_VERSION__}</p>
            <p className="flex min-h-6 items-center gap-1">
              Developed by
              <DeveloperLink className="inline-flex min-h-6 items-center font-medium text-fg hover:text-primary hover:underline" />
            </p>
            <a href="#/about" className="inline-flex min-h-6 items-center font-medium text-primary hover:underline">About Unique PDF</a>
          </div>
        </div>
      </Group>

      <ConfirmDialog
        open={confirm !== null}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm === 'all') {
            await clearHistory();
            await resetSettings();
            await resetReviewPrompt();
            toast.show('All local data was cleared.', 'success');
          } else {
            await clearHistory();
            toast.show('History cleared.', 'success');
          }
          setConfirm(null);
        }}
        title={confirm === 'all' ? 'Clear all local data?' : 'Clear history?'}
        message={confirm === 'all' ? 'This resets all settings to their defaults and removes your recent-task history (and the review-prompt counter) from this browser.' : 'This removes the list of recent tasks from this browser.'}
        confirmLabel="Clear"
        tone="danger"
      />
    </div>
  );
}

