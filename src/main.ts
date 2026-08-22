import Alpine from 'alpinejs';
import { appRuntime } from './services/appRuntime';
import {
  Calendar,
  FolderInput,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  X,
  createIcons
} from 'lucide';
import { sevaWorkspace } from './features/seva/sevaWorkspace';
import './styles/main.css';

declare global {
  interface Window {
    appRuntime: typeof appRuntime;
    sevaWorkspace: typeof sevaWorkspace;
    Alpine: typeof Alpine;
  }
}

window.appRuntime = appRuntime;
window.sevaWorkspace = sevaWorkspace;
window.Alpine = Alpine;

createIcons({
  icons: {
    Calendar,
    FolderInput,
    Phone,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
    Trash2,
    UserCheck,
    UserCog,
    UserPlus,
    Users,
    X
  },
  inTemplates: true
});
Alpine.start();
