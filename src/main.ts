import Alpine from 'alpinejs';
import { appRuntime } from './services/appRuntime';
import {
  ArrowDownUp,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Download,
  EllipsisVertical,
  ExternalLink,
  FilePlus,
  FolderInput,
  LayoutGrid,
  NotebookPen,
  Paperclip,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  Power,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Table2,
  Trash2,
  TriangleAlert,
  UserCheck,
  UserCog,
  UserPlus,
  UserRoundPlus,
  Users,
  X,
  createIcons
} from 'lucide';
import './styles/main.css';

type SevaWorkspaceFactory =
  (typeof import('./features/seva/sevaWorkspace'))['sevaWorkspace'];

declare global {
  interface Window {
    appRuntime: typeof appRuntime;
    sevaWorkspace: SevaWorkspaceFactory;
    Alpine: typeof Alpine;
  }
}

window.appRuntime = appRuntime;
window.Alpine = Alpine;

async function bootstrap() {
  const { sevaWorkspace } = await import('./features/seva/sevaWorkspace');
  window.sevaWorkspace = sevaWorkspace;
  createIcons({
    icons: {
      ArrowDownUp,
      Calendar,
      CalendarCheck,
      CalendarClock,
      Download,
      EllipsisVertical,
      ExternalLink,
      FilePlus,
      FolderInput,
      LayoutGrid,
      NotebookPen,
      Paperclip,
      Pencil,
      Phone,
      PhoneCall,
      Plus,
      Power,
      RefreshCw,
      Search,
      SlidersHorizontal,
      Star,
      Table2,
      Trash2,
      TriangleAlert,
      UserCheck,
      UserCog,
      UserPlus,
      UserRoundPlus,
      Users,
      X
    },
    inTemplates: true
  });
  Alpine.start();
}

void bootstrap();
