"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

type Supplier = Tables<"suppliers">;

type NoteRow = Pick<
  Tables<"supplier_notes">,
  "id" | "content" | "created_at" | "manager_id"
>;

type Props = {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  onSupplierUpdated?: (s: Supplier) => void;
};

function SupplierCardDialogContent({
  supplier,
  currentUserId,
  onSupplierUpdated,
}: {
  supplier: Supplier;
  currentUserId: string;
  onSupplierUpdated?: (s: Supplier) => void;
}) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [nextDate, setNextDate] = useState(
    () => supplier.next_contact_date ?? "",
  );
  const [savingNote, setSavingNote] = useState(false);
  const [savingDate, setSavingDate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingNotes(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("supplier_notes")
        .select("id, content, created_at, manager_id")
        .eq("supplier_id", supplier.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setLoadingNotes(false);
        if (error) {
          toast.error("Не удалось загрузить заметки", {
            description: error.message,
          });
          setNotes([]);
        } else {
          setNotes(data ?? []);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supplier.id]);

  async function handleAddNote() {
    const content = noteText.trim();
    if (!content) {
      toast.error("Введите текст заметки");
      return;
    }
    setSavingNote(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("supplier_notes")
      .insert({
        supplier_id: supplier.id,
        manager_id: currentUserId,
        content,
      })
      .select("id, content, created_at, manager_id")
      .single();
    setSavingNote(false);
    if (error) {
      toast.error("Не удалось сохранить", { description: error.message });
      return;
    }
    setNoteText("");
    setNotes((prev) => [data, ...prev]);
    toast.success("Заметка сохранена");
  }

  async function handleSaveNextContact() {
    setSavingDate(true);
    const supabase = createClient();
    const payload =
      nextDate === ""
        ? { next_contact_date: null as string | null }
        : { next_contact_date: nextDate };
    const { data, error } = await supabase
      .from("suppliers")
      .update(payload)
      .eq("id", supplier.id)
      .select("*")
      .single();
    setSavingDate(false);
    if (error) {
      toast.error("Не удалось обновить дату", { description: error.message });
      return;
    }
    onSupplierUpdated?.(data as Supplier);
    toast.success("Дата следующего звонка обновлена");
  }

  const preview = notes.slice(0, 3);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{supplier.name}</DialogTitle>
        <DialogDescription className="font-mono text-xs">
          БИН {supplier.bin}
          {supplier.category ? ` · ${supplier.category}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Последние заметки
          </p>
          {loadingNotes ? (
            <p className="mt-2 text-sm text-muted-foreground">Загрузка…</p>
          ) : preview.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Пока нет ваших заметок по этой карточке
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {preview.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-sm"
                >
                  <p className="whitespace-pre-wrap text-foreground">
                    {n.content}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator />

        <div className="grid gap-2">
          <Label htmlFor="next_contact">Следующий звонок</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="next_contact"
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="max-w-[11rem]"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setNextDate("")}
            >
              Очистить
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveNextContact()}
              disabled={savingDate}
            >
              {savingDate ? "…" : "Сохранить"}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="grid gap-2">
          <Label htmlFor="note">Краткая заметка</Label>
          <Textarea
            id="note"
            placeholder="Итог звонка, договорённости…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
          />
          <Button
            type="button"
            className="w-fit"
            onClick={() => void handleAddNote()}
            disabled={savingNote}
          >
            {savingNote ? "Сохранение…" : "Добавить заметку"}
          </Button>
        </div>

        {notes.length > 3 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-foreground">
                Полная история
              </p>
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-border/60 px-2 py-1.5 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("ru-RU")}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap text-foreground">
                      {n.content}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </DialogContent>
  );
}

export function SupplierCardDialog({
  supplier,
  open,
  onOpenChange,
  currentUserId,
  onSupplierUpdated,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && supplier ? (
        <SupplierCardDialogContent
          key={supplier.id}
          supplier={supplier}
          currentUserId={currentUserId}
          onSupplierUpdated={onSupplierUpdated}
        />
      ) : null}
    </Dialog>
  );
}
