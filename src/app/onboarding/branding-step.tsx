"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoField } from "@/components/logo-field";
import { MagicFill, type MagicFillResult } from "@/components/magic-fill";

export function BrandingStep({
  initial,
  nextHref,
  backHref,
}: {
  initial: {
    primaryLogoUrl: string | null;
    brandColorPrimary: string | null;
    brandColorSecondary: string | null;
    fontFamily: string | null;
  };
  nextHref: string;
  backHref: string;
}) {
  const router = useRouter();
  const [logo, setLogo] = useState(initial.primaryLogoUrl ?? "");
  const [primary, setPrimary] = useState(initial.brandColorPrimary ?? "#1e6f3a");
  const [secondary, setSecondary] = useState(initial.brandColorSecondary ?? "#0f3d20");
  const [font, setFont] = useState(initial.fontFamily ?? "");
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/settings/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryLogoUrl: logo || null,
          brandColorPrimary: primary || null,
          brandColorSecondary: secondary || null,
          fontFamily: font || null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        toast.error(json.message ?? "Couldn't save branding.");
        return;
      }
      router.push(nextHref);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          These appear on PDF reports and in the app header. All optional.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <MagicFill
            disabled={pending}
            onFilled={(r: MagicFillResult) => {
              if (r.logoUrl) setLogo(r.logoUrl);
              if (r.primaryColor) setPrimary(r.primaryColor);
              if (r.secondaryColor) setSecondary(r.secondaryColor);
              if (r.fontFamily) setFont(r.fontFamily);
            }}
          />
          <LogoField value={logo} onChange={setLogo} disabled={pending} />
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              id="brand-primary"
              label="Primary color"
              value={primary}
              onChange={setPrimary}
            />
            <ColorField
              id="brand-secondary"
              label="Secondary color"
              value={secondary}
              onChange={setSecondary}
            />
          </div>
          <div>
            <Label htmlFor="font">Font family</Label>
            <Input
              id="font"
              value={font}
              onChange={(e) => setFont(e.target.value)}
              placeholder="Inter, Helvetica, sans-serif"
              className="mt-1.5 h-11"
            />
          </div>
          <div className="flex justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11"
              onClick={() => router.push(backHref)}
              disabled={pending}
            >
              Back
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-11"
                onClick={() => router.push(nextHref)}
                disabled={pending}
              >
                Skip
              </Button>
              <Button type="submit" size="lg" className="h-11" disabled={pending}>
                {pending ? "Saving…" : "Continue"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={`${id}-swatch`}
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 cursor-pointer rounded-md border border-zinc-300 dark:border-zinc-700"
          aria-label={`${label} swatch`}
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#1e6f3a"
          className="h-11 flex-1 font-mono text-sm"
        />
      </div>
    </div>
  );
}
