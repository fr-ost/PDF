import type { ToolProps } from '../registry';
import { EditorWorkspace } from './EditorTool';

/** "Sign PDF" opens the editor with the signature pad ready. */
export default function SignTool(props: ToolProps) {
  return <EditorWorkspace {...props} mode="sign" />;
}
