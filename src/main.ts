import Alpine from 'alpinejs';
import { appRuntime } from './services/appRuntime';
import {
  Calendar,
  Download,
  ExternalLink,
  FolderInput,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Power,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
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
  typeof import('./features/seva/sevaWorkspace')['sevaWorkspace'];

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
      Calendar,
      Download,
      ExternalLink,
      FolderInput,
      Paperclip,
      Pencil,
      Phone,
      Plus,
      Power,
      RefreshCw,
      Search,
      SlidersHorizontal,
      Trash2,
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
