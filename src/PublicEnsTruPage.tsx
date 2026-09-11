import { ShieldCheck } from 'lucide-react';
import { EnsTruCheckPanel } from './components/EnsTruCheckPanel';

/** Публичная страница /enstru — без логина, отдельно от основного приложения. */
export function PublicEnsTruPage() {
  return (
    <div className="om-page min-h-screen flex flex-col bg-[#f4f6f8]">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl text-white">
            <ShieldCheck size={20} />
          </div>
          <h1 className="font-black text-gray-900 text-base sm:text-lg">Проверка ЕНС ТРУ</h1>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <EnsTruCheckPanel />
      </main>
    </div>
  );
}
