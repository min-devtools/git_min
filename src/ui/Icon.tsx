import type { CSSProperties } from "react";
import cIcon from "material-icon-theme/icons/c.svg";
import cppIcon from "material-icon-theme/icons/cpp.svg";
import cssIcon from "material-icon-theme/icons/css.svg";
import databaseIcon from "material-icon-theme/icons/database.svg";
import goIcon from "material-icon-theme/icons/go.svg";
import htmlIcon from "material-icon-theme/icons/html.svg";
import javaIcon from "material-icon-theme/icons/java.svg";
import javascriptIcon from "material-icon-theme/icons/javascript.svg";
import kotlinIcon from "material-icon-theme/icons/kotlin.svg";
import lessIcon from "material-icon-theme/icons/less.svg";
import phpIcon from "material-icon-theme/icons/php.svg";
import pythonIcon from "material-icon-theme/icons/python.svg";
import reactIcon from "material-icon-theme/icons/react.svg";
import rubyIcon from "material-icon-theme/icons/ruby.svg";
import rustIcon from "material-icon-theme/icons/rust.svg";
import sassIcon from "material-icon-theme/icons/sass.svg";
import svelteIcon from "material-icon-theme/icons/svelte.svg";
import swiftIcon from "material-icon-theme/icons/swift.svg";
import typescriptIcon from "material-icon-theme/icons/typescript.svg";
import vueIcon from "material-icon-theme/icons/vue.svg";
export { fileIcon, fileIconTone } from "../lib/fileIcons";
import {
  Activity,
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  Cloud,
  Code2,
  Columns2,
  Copy,
  Database,
  Download,
  Eraser,
  File,
  FileCode2,
  FileCog,
  FileImage,
  FileJson2,
  FileText,
  Files,
  Filter,
  Folder,
  FolderGit2,
  FolderOpen,
  Gauge,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Globe,
  Hash,
  History,
  Info,
  Key,
  Keyboard,
  Layers,
  List,
  ListOrdered,
  Loader2,
  Minimize2,
  Moon,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pause,
  Pencil,
  Play,
  Plug,
  Plus,
  Radio,
  RefreshCw,
  Rows3,
  Rows2,
  Save,
  Search,
  Send,
  Settings2,
  Sparkles,
  Sun,
  Table2,
  Tag,
  Terminal,
  Timer,
  Trash2,
  Upload,
  Users,
  Waves,
  WrapText,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  activity: Activity,
  "arrow-left": ChevronLeft,
  "arrow-right": ChevronRight,
  braces: Braces,
  check: Check,
  "chevrons-left": ChevronsLeft,
  "chevrons-right": ChevronsRight,
  cluster: Activity,
  cloud: Cloud,
  code: Code2,
  columns: Columns2,
  copy: Copy,
  database: Database,
  docs: Files,
  download: Download,
  eraser: Eraser,
  file: File,
  "file-code": FileCode2,
  "file-cog": FileCog,
  "file-image": FileImage,
  "file-json": FileJson2,
  "file-text": FileText,
  filter: Filter,
  folder: Folder,
  "folder-git": FolderGit2,
  "folder-open": FolderOpen,
  gauge: Gauge,
  "git-branch": GitBranch,
  "git-commit": GitCommitHorizontal,
  "git-merge": GitMerge,
  github: GitBranch,
  globe: Globe,
  "pull-request": GitPullRequest,
  groups: Users,
  hash: Hash,
  history: History,
  info: Info,
  key: Key,
  keyboard: Keyboard,
  layers: Layers,
  list: List,
  "list-ordered": ListOrdered,
  loader: Loader2,
  minify: Minimize2,
  moon: Moon,
  "more-horizontal": MoreHorizontal,
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  pause: Pause,
  pencil: Pencil,
  play: Play,
  plug: Plug,
  plus: Plus,
  radio: Radio,
  refresh: RefreshCw,
  rows: Rows3,
  "rows-2": Rows2,
  save: Save,
  search: Search,
  send: Send,
  settings: Settings2,
  sparkles: Sparkles,
  status: CircleDot,
  stream: Waves,
  sun: Sun,
  table: Table2,
  tag: Tag,
  terminal: Terminal,
  timer: Timer,
  topics: Layers,
  trash: Trash2,
  upload: Upload,
  wrap: WrapText,
  x: X,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

const FILE_ICON_SOURCES = {
  "file-c": cIcon,
  "file-cpp": cppIcon,
  "file-css": cssIcon,
  "file-go": goIcon,
  "file-html": htmlIcon,
  "file-java": javaIcon,
  "file-javascript": javascriptIcon,
  "file-kotlin": kotlinIcon,
  "file-less": lessIcon,
  "file-php": phpIcon,
  "file-python": pythonIcon,
  "file-react": reactIcon,
  "file-ruby": rubyIcon,
  "file-rust": rustIcon,
  "file-sass": sassIcon,
  "file-sql": databaseIcon,
  "file-svelte": svelteIcon,
  "file-swift": swiftIcon,
  "file-typescript": typescriptIcon,
  "file-vue": vueIcon,
} as const;

export type IconName = keyof typeof ICONS | keyof typeof FILE_ICON_SOURCES;

interface Props {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 15, style, className }: Props) {
  if (name in FILE_ICON_SOURCES) {
    return (
      <img
        src={FILE_ICON_SOURCES[name as keyof typeof FILE_ICON_SOURCES]}
        width={size}
        height={size}
        style={{ flex: "none", ...style }}
        className={className}
        aria-hidden
      />
    );
  }
  const Component = ICONS[name as keyof typeof ICONS];
  return <Component size={size} strokeWidth={1.8} style={{ flex: "none", ...style }} className={className} aria-hidden />;
}
