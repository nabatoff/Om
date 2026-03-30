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

type CommentListItem = Pick<
  Tables<"supplier_comments">,
  "id" | "body" | "created_at" | "author_id"
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
  const [comments, setComments] = useState<CommentListItem[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState(
    () => supplier.next_contact_date ?? "",
  );
  const [savingNote, setSavingNote] = useState(false);
  const [savingDate, setSavingDate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingComments(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("supplier_comments")
        .select("id, body, created_at, author_id")
        .eq("supplier_id", supplier.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setLoadingComments(false);
        if (error) {
          toast.error("Не удалось загрузить заметки", {
            description: error.message,
          });
          setComments([]);
        } else {
          setComments(data ?? []);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [supplier.id]);

  async function handleAddNote() {
    const body = note.trim();
    if (!body) {
      toast.error("Введите текст заметки");
      return;
    }
    setSavingNote(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("supplier_comments")
      .insert({
        supplier_id: supplier.id,
        author_id: currentUserId,
        body,
      })
      .select("id, body, created_at, author_id")
      .single();
    setSavingNote(false);
    if (error) {
      toast.error("Не удалось сохранить", { description: error.message });
      return;
    }
    setNote("");
    setComments((prev) => [data, ...prev]);
    toast.success("Заметка добавлена");
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
    toast.success("Дата следующего контакта сохранена");
  }

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
        <div className="grid gap-2">
          <Label htmlFor="next_contact">Следующий контакт</Label>
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
              {savingDate ? "…" : "Сохранить дату"}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="grid gap-2">
          <Label htmlFor="note">Новая заметка</Label>
          <Textarea
            id="note"
            placeholder="Контекст звонка, договорённости…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
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

        <div>
          <p className="text-sm font-medium text-foreground">История</p>
          {loadingComments ? (
            <p className="mt-2 text-sm text-muted-foreground">Загрузка…</p>
          ) : comments.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Пока нет заметок
            </p>
          ) : (
            <ul className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-border/80 bg-muted/30 p-3 text-sm"
                >
                  <p className="whitespace-pre-wrap text-foreground">{c.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.author_id === currentUserId
                      ? "Вы"
                      : `ID ${c.author_id.slice(0, 8)}…`}{" "}
                    · {new Date(c.created_at).toLocaleString("ru-RU")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
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
