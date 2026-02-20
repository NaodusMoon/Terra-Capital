import Image from "next/image";
import { APP_NAME } from "@/lib/constants";

export function LogoBadge() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/images/logo.png"
        alt="Terra Capital logo"
        width={88}
        height={58}
        className="h-14 w-auto object-contain"
        priority
      />
      <div>
        <p className="text-lg font-bold tracking-tight">{APP_NAME}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[color:color-mix(in_oklab,var(--color-nav-foreground)_65%,var(--color-muted))]">
          Tokenizacion
        </p>
      </div>
    </div>
  );
}
