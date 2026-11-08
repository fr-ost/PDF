/**
 * The catalogue of tools. Only features that are fully implemented and
 * tested are listed here; roadmap items (OCR, Office conversion, …) are
 * documented in ROADMAP.md and intentionally kept out of the interface.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  ArrowDownUp,
  Combine,
  Droplet,
  EyeOff,
  FileImage,
  FileMinus,
  FileOutput,
  Hash,
  ImagePlus,
  LayoutGrid,
  Lock,
  LockOpen,
  MessagesSquare,
  Minimize2,
  PenLine,
  RotateCw,
  Scissors,
  Signature,
  Sparkles,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '../app/router';
import type { FileKind } from '../services/file-service/files';

export interface ToolProps {
  tool: ToolDefinition;
  initialFiles: File[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: Category;
  icon: LucideIcon;
  accepts: FileKind;
  multiple: boolean;
  keywords: string[];
  component: LazyExoticComponent<ComponentType<ToolProps>>;
  /** Starts loading the tool's code ahead of time (hover, focus, idle). */
  preload: () => void;
}

type ToolModule = { default: ComponentType<ToolProps> };

function tool(def: Omit<ToolDefinition, 'component' | 'preload'>, load: () => Promise<ToolModule>): ToolDefinition {
  let pending: Promise<ToolModule> | null = null;
  const get = () =>
    (pending ??= load().catch((err: unknown) => {
      pending = null; // allow a retry after a failed load
      throw err;
    }));
  return { ...def, component: lazy(get), preload: () => void get().catch(() => undefined) };
}

export const CATEGORY_INFO: Record<Category, { title: string; description: string }> = {
  organize: { title: 'Organize PDF', description: 'Merge, split and rearrange documents and pages.' },
  convert: { title: 'Convert PDF', description: 'Compress PDFs and convert between PDFs and images.' },
  edit: { title: 'Edit PDF', description: 'Add text, drawings, signatures, watermarks and page numbers.' },
  security: { title: 'Security', description: 'Protect, unlock, redact and clean up documents.' },
  ai: { title: 'Unique AI', description: 'Chat with your PDFs and get instant summaries with Unique AI.' },
};

export const TOOLS: ToolDefinition[] = [
  tool({ id: 'merge', name: 'Merge PDF', description: 'Combine several PDFs into one document in the order you choose.', category: 'organize', icon: Combine, accepts: 'pdf', multiple: true, keywords: ['combine', 'join', 'append'] }, () => import('./merge/MergeTool')),
  tool({ id: 'split', name: 'Split PDF', description: 'Separate pages into individual files, ranges or equal parts.', category: 'organize', icon: Scissors, accepts: 'pdf', multiple: false, keywords: ['separate', 'divide', 'burst'] }, () => import('./split/SplitTool')),
  tool({ id: 'organize', name: 'Organize pages', description: 'One workspace to reorder, rotate, delete and combine pages from several PDFs.', category: 'organize', icon: LayoutGrid, accepts: 'pdf', multiple: true, keywords: ['arrange', 'sort', 'workspace'] }, () => import('./organize/OrganizeTool')),
  tool({ id: 'rotate', name: 'Rotate PDF', description: 'Turn individual pages, selections or the whole document.', category: 'organize', icon: RotateCw, accepts: 'pdf', multiple: false, keywords: ['turn', 'orientation', 'landscape'] }, () => import('./rotate/RotateTool')),
  tool({ id: 'reorder', name: 'Reorder pages', description: 'Drag page thumbnails into a new order.', category: 'organize', icon: ArrowDownUp, accepts: 'pdf', multiple: false, keywords: ['rearrange', 'sort', 'move'] }, () => import('./reorder/ReorderTool')),
  tool({ id: 'delete-pages', name: 'Delete pages', description: 'Remove unwanted pages permanently.', category: 'organize', icon: FileMinus, accepts: 'pdf', multiple: false, keywords: ['remove', 'drop'] }, () => import('./delete-pages/DeletePagesTool')),
  tool({ id: 'extract', name: 'Extract pages', description: 'Save selected pages as a new PDF or as separate files.', category: 'organize', icon: FileOutput, accepts: 'pdf', multiple: false, keywords: ['select', 'pull out', 'save pages'] }, () => import('./extract/ExtractTool')),
  tool({ id: 'compress', name: 'Compress PDF', description: 'Reduce file size by optimising images and removing unused data.', category: 'convert', icon: Minimize2, accepts: 'pdf', multiple: false, keywords: ['reduce', 'shrink', 'optimize', 'smaller'] }, () => import('./compress/CompressTool')),
  tool({ id: 'images-to-pdf', name: 'Images to PDF', description: 'Turn JPG, PNG, WebP and other images into a PDF.', category: 'convert', icon: ImagePlus, accepts: 'image', multiple: true, keywords: ['jpg to pdf', 'png to pdf', 'photo', 'scan'] }, () => import('./image-to-pdf/ImageToPdfTool')),
  tool({ id: 'pdf-to-images', name: 'PDF to images', description: 'Export pages as high-quality PNG or JPEG images.', category: 'convert', icon: FileImage, accepts: 'pdf', multiple: false, keywords: ['pdf to jpg', 'pdf to png', 'export'] }, () => import('./pdf-to-image/PdfToImageTool')),
  tool({ id: 'edit', name: 'Edit PDF', description: 'Add text, drawings, shapes, highlights and images on top of pages.', category: 'edit', icon: PenLine, accepts: 'pdf', multiple: false, keywords: ['annotate', 'write', 'draw', 'markup'] }, () => import('./editor/EditorTool')),
  tool({ id: 'sign', name: 'Sign PDF', description: 'Draw your signature and place it anywhere on the document.', category: 'edit', icon: Signature, accepts: 'pdf', multiple: false, keywords: ['signature', 'e-sign', 'initials'] }, () => import('./editor/SignTool')),
  tool({ id: 'watermark', name: 'Watermark', description: 'Stamp text or an image across pages with full control over style.', category: 'edit', icon: Droplet, accepts: 'pdf', multiple: false, keywords: ['stamp', 'confidential', 'draft', 'logo'] }, () => import('./watermark/WatermarkTool')),
  tool({ id: 'page-numbers', name: 'Page numbers', description: 'Number pages with your choice of position, format and style.', category: 'edit', icon: Hash, accepts: 'pdf', multiple: false, keywords: ['numbering', 'pagination', 'footer'] }, () => import('./page-number/PageNumberTool')),
  tool({ id: 'protect', name: 'Protect PDF', description: 'Encrypt a PDF with a password using AES-256.', category: 'security', icon: Lock, accepts: 'pdf', multiple: false, keywords: ['encrypt', 'password', 'secure'] }, () => import('./security/ProtectTool')),
  tool({ id: 'unlock', name: 'Unlock PDF', description: 'Remove password protection from a PDF you have the password for.', category: 'security', icon: LockOpen, accepts: 'pdf', multiple: false, keywords: ['decrypt', 'remove password'] }, () => import('./security/UnlockTool')),
  tool({ id: 'redact', name: 'Redact PDF', description: 'Permanently remove sensitive text and areas — not just cover them.', category: 'security', icon: EyeOff, accepts: 'pdf', multiple: false, keywords: ['black out', 'censor', 'privacy', 'hide'] }, () => import('./security/RedactTool')),
  tool({ id: 'ai-chat', name: 'Chat with PDF', description: 'Ask Unique AI anything about your PDF and get answers with page references.', category: 'ai', icon: MessagesSquare, accepts: 'pdf', multiple: false, keywords: ['ask', 'question', 'chat', 'ai', 'assistant', 'talk to pdf', 'q&a', 'unique ai'] }, () => import('./ai-chat/AiChatTool')),
  tool({ id: 'ai-summary', name: 'AI Summary', description: 'Get the key points of any PDF in seconds with Unique AI.', category: 'ai', icon: Sparkles, accepts: 'pdf', multiple: false, keywords: ['summarize', 'summary', 'tldr', 'key points', 'ai', 'digest', 'unique ai'] }, () => import('./ai-summary/AiSummaryTool')),
  tool({ id: 'metadata', name: 'Edit metadata', description: 'View, edit or remove the title, author and other hidden properties.', category: 'security', icon: Tags, accepts: 'pdf', multiple: false, keywords: ['properties', 'author', 'title', 'remove metadata'] }, () => import('./metadata/MetadataTool')),
];

export function getTool(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function toolsIn(category: Category): ToolDefinition[] {
  return TOOLS.filter((t) => t.category === category);
}
