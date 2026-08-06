import { useState } from 'react';
import { ClipboardCheck, Loader2, Search } from 'lucide-react';
import { checkEnsTruCodesApi, parseEnsTruInput } from '../lib/ensTruApi';

export function EnsTruCheckPanel() {
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<Array<{ code: string; names: string[] }>>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    const { codes, invalid } = parseEnsTruInput(input);
    if (codes.length === 0 && invalid.length === 0) {
      setError('Введите хотя бы один код ЕНС ТРУ');
      setFound([]);
      setNotFound([]);
      return;
    }

    setChecking(true);
    setError(null);
    try {
      const results = await checkEnsTruCodesApi(codes);
      const foundRows: Array<{ code: string; names: string[] }> = [];
      const missing: string[] = [...invalid];

      for (const r of results) {
        if (r.found && r.names.length > 0) {
          foundRows.push({ code: r.inputCode, names: r.names });
        } else {
          missing.push(r.inputCode);
        }
      }

      setFound(foundRows);
      setNotFound(missing);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось проверить коды');
      setFound([]);
      setNotFound([]);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 text-left">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-600 rounded-xl text-white">
          <ClipboardCheck size={22} />
        </div>
        <div>
          <h2 className="text-lg font-black text-gray-900">Проверка ЕНС ТРУ</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Сверка кодов со справочником
          </p>
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4 max-w-3xl">
        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase">Коды для проверки</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            placeholder={'Вставьте коды по одному на строку или столбец из Excel\nНапример:\n139212.700.000001\n139211.300.000000'}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono resize-y min-h-[160px]"
          />
        </label>
        {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
        <button
          type="button"
          disabled={checking}
          onClick={() => void handleCheck()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-500 disabled:opacity-60"
        >
          {checking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {checking ? 'Проверка…' : 'Проверить'}
        </button>
      </section>

      {(found.length > 0 || notFound.length > 0) && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 font-bold">
            Найдено: <span className="text-emerald-700">{found.length}</span>
            {' · '}
            Наименований:{' '}
            <span className="text-emerald-700">{found.reduce((n, r) => n + r.names.length, 0)}</span>
            {' · '}
            Не найдено: <span className="text-rose-700">{notFound.length}</span>
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white border border-emerald-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Есть</h3>
              </div>
              <ul className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
                {found.length === 0 ? (
                  <li className="px-5 py-4 text-sm text-gray-400">—</li>
                ) : (
                  found.map((row) => (
                    <li key={row.code} className="px-5 py-3 text-sm">
                      <span className="font-mono font-bold text-gray-900 block">{row.code}</span>
                      <ul className="mt-1 space-y-0.5">
                        {row.names.map((name) => (
                          <li key={name} className="text-gray-600 text-xs">
                            {name}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="bg-white border border-rose-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-rose-50 border-b border-rose-100">
                <h3 className="text-xs font-bold text-rose-800 uppercase tracking-wider">Нет</h3>
              </div>
              <ul className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
                {notFound.length === 0 ? (
                  <li className="px-5 py-4 text-sm text-gray-400">—</li>
                ) : (
                  notFound.map((code) => (
                    <li key={code} className="px-5 py-3 text-sm font-mono font-bold text-gray-800">
                      {code}
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
