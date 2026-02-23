import { Send } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";

interface ChatInputProps { onSend: (content: string) => void; disabled?: boolean; placeholder?: string; }

export function ChatInput({ onSend, disabled = false, placeholder }: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => { const trimmed = value.trim(); if (!trimmed || disabled) return; onSend(trimmed); setValue(""); if (textareaRef.current) textareaRef.current.style.height = "auto"; };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setValue(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
      <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        <textarea ref={textareaRef} rows={1} value={value} onChange={handleInput} onKeyDown={handleKeyDown} disabled={disabled} placeholder={placeholder ?? t("chat.inputPlaceholder")} className="max-h-[120px] min-h-[24px] flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50" />
        <button onClick={handleSend} disabled={!value.trim() || disabled} aria-label={t("chat.send")} className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors", value.trim() && !disabled ? "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800" : "bg-gray-200 text-gray-400")}>
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-center text-[10px] text-gray-400">{t("chat.enterHint")}</p>
    </div>
  );
}
