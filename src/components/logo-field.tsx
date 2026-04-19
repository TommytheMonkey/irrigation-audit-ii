"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/image-compress";

export function LogoField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(rawFile: File) {
    if (!/^image\//.test(rawFile.type)) {
      toast.error("Pick an image file.");
      return;
    }
    setUploading(true);
    try {
      // Logos don't need to be huge — 1024px longest edge is plenty for
      // the app header and any PDF cover usage.
      const file = await compressImage(rawFile, { maxEdge: 1024 });
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Upload failed.");
        return;
      }
      onChange(data.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="logo">Logo</Label>
      {value && (
        <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Logo preview"
            className="h-10 w-10 rounded object-contain"
          />
          <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {value}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            disabled={disabled || uploading}
          >
            Remove
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 sm:w-auto"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
        </Button>
        <Input
          id="logo"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="…or paste a URL"
          className="h-11 flex-1"
          disabled={disabled || uploading}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
