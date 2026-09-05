import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

function Icon({
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ChevronDown({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M5 12.5l4.2 4.2L19 7.5" />
    </Icon>
  );
}

export function CubeIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Icon>
  );
}

export function SpeakerIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 10v4h3l5 4V6l-5 4H4z" />
      <path d="M16.2 9.2a4 4 0 010 5.6" />
    </Icon>
  );
}

export function SpeakerMutedIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4 10v4h3l5 4V6l-5 4H4z" />
      <path d="M15.5 9.5l4.5 5M20 9.5l-4.5 5" />
    </Icon>
  );
}

export function TargetIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </Icon>
  );
}

export function LayersIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M12 4l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </Icon>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.2L15 15" />
    </Icon>
  );
}

export function SparkleIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.5l1.6 6.4L20 10.5l-6.4 1.6L12 18.5l-1.6-6.4L4 10.5l6.4-1.6L12 2.5z" />
    </svg>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  "ai-engineering": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" />
      <path d="M9.2 8.2c-1.2.4-2 1.4-2.2 2.6M14.8 8.2c1.2.4 2 1.4 2.2 2.6" />
    </>
  ),
  "computer-science": (
    <>
      <rect x="3.5" y="5" width="17" height="11.5" rx="1.6" />
      <path d="M8 20h8M12 16.5V20" />
    </>
  ),
  "machine-learning": (
    <>
      <path d="M4 16l4.2-4.2 3.3 2.4L20 7" />
      <path d="M15.5 7H20v4.5" />
    </>
  ),
  "deep-learning": (
    <>
      <circle cx="6" cy="7" r="1.6" />
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="6" cy="17" r="1.6" />
      <circle cx="18" cy="9.5" r="1.6" />
      <circle cx="18" cy="14.5" r="1.6" />
      <path d="M7.6 7.4L16.4 9.2M7.6 12L16.4 9.5M7.6 12L16.4 14.5M7.6 16.6L16.4 14.8" />
    </>
  ),
  nlp: (
    <>
      <path d="M5 7h9a2 2 0 012 2v4a2 2 0 01-2 2H9l-4 3v-3H5a2 2 0 01-2-2V9a2 2 0 012-2z" />
      <path d="M16 10.5h3a1.5 1.5 0 011.5 1.5v3.2H19l-2 2v-2h-.5" />
    </>
  ),
  "rag-llm": (
    <>
      <path d="M12 5l7.5 3.6L12 12.2 4.5 8.6 12 5z" />
      <path d="M6 12.2L12 15l6-2.8" />
      <path d="M6 15.2L12 18l6-2.8" />
    </>
  ),
  "system-design": (
    <>
      <rect x="4" y="4" width="16" height="5" rx="1" />
      <rect x="4" y="10.5" width="16" height="4.2" rx="1" />
      <rect x="4" y="16.2" width="16" height="3.8" rx="1" />
    </>
  ),
  "software-engineering": (
    <>
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" />
    </>
  ),
  finance: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M9.2 9.2c.6-1 1.6-1.5 2.8-1.5 1.7 0 2.8.8 2.8 2.1 0 2.8-5.6 1.4-5.6 4.2 0 1.3 1.2 2.2 3 2.2 1.2 0 2.2-.5 2.8-1.4" />
    </>
  ),
  politics: (
    <>
      <path d="M4 19h16M6 19V10M10 19V10M14 19V10M18 19V10M4 10h16M12 4l8 6H4l8-6z" />
    </>
  ),
  geopolitics: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.4 2.6 3.6 5.4 3.6 8S14.4 17.4 12 20c-2.4-2.6-3.6-5.4-3.6-8S9.6 6.6 12 4z" />
    </>
  ),
  business: (
    <>
      <path d="M8 10V8a4 4 0 018 0v2" />
      <rect x="4" y="10" width="16" height="10" rx="1.5" />
      <path d="M4 14h16" />
    </>
  ),
  psychology: (
    <>
      <path d="M15 8.2a4.2 4.2 0 10-6.4 3.6c.6.4 1 1 1 1.7V15h4.2v-1.5c0-.7.4-1.3 1-1.7.6-.4 1-.8 1.2-1.4" />
      <path d="M10 18.5h4" />
      <path d="M12 15v3.5" />
    </>
  ),
  "general-knowledge": (
    <>
      <path d="M5 6.5c2-.8 4-.8 6 0v12c-2-.8-4-.8-6 0V6.5zM13 6.5c2-.8 4-.8 6 0v12c-2-.8-4-.8-6 0V6.5z" />
      <path d="M12 6.5v12" />
    </>
  ),
  history: (
    <>
      <path d="M4 19h16M6 19V11M10 19V11M14 19V11M18 19V11M5 11h14M8 8l4-4 4 4" />
    </>
  ),
};

export function CategoryIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return <Icon className={className}>{PATHS[id] ?? PATHS["general-knowledge"]}</Icon>;
}
