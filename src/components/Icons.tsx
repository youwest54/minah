import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function BottleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.2 2.5h3.6a1.6 1.6 0 0 1 0 3.2h-3.6a1.6 1.6 0 0 1 0-3.2Z" />
      <path d="M9.4 5.7h5.2v1.1c0 .6.25 1.1.7 1.5l.5.45c.6.5.95 1.25.95 2.05v8.05c0 1.2-.98 2.15-2.2 2.15H9.45c-1.22 0-2.2-.95-2.2-2.15V10.8c0-.8.35-1.55.95-2.05l.5-.45c.45-.4.7-.9.7-1.5V5.7Z" />
      <path d="M8.5 12.4h4.2M8.5 15.6h4.2" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.6 14.8A8.9 8.9 0 0 1 9.2 3.4a8.9 8.9 0 1 0 11.4 11.4Z" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.2v2.3M12 19.5v2.3M2.2 12h2.3M19.5 12h2.3M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" />
    </Icon>
  );
}

export function DiaperIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 5.4h17.2v2.7c0 1.5-1.1 2.8-2.6 3.1-2 .45-3.5 2.25-3.5 4.4V19H9.5v-3.4c0-2.15-1.5-3.95-3.5-4.4C4.5 10.9 3.4 9.6 3.4 8.1Z" />
      <path d="M3.4 8.1h17.2" />
    </Icon>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.4h8.2L19 8.2v12.4H6Z" />
      <path d="M14 3.4v4.8h4.8" />
      <path d="M9 12.6h6M9 16h4" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.3V12l3.4 2.1" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.6 20.3v-1.8a3.6 3.6 0 0 0-3.6-3.6H6.3a3.6 3.6 0 0 0-3.6 3.6v1.8" />
      <circle cx="9.15" cy="7.6" r="3.3" />
      <path d="M21.3 20.3v-1.8a3.6 3.6 0 0 0-2.7-3.48M16.2 4.5a3.6 3.6 0 0 1 0 6.9" />
    </Icon>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.4 6.4h12M8.4 12h12M8.4 17.6h12M4 6.4h.01M4 12h.01M4 17.6h.01" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 10.2 12 3.4l8.4 6.8v9a1.4 1.4 0 0 1-1.4 1.4H5a1.4 1.4 0 0 1-1.4-1.4Z" />
      <path d="M9.4 20.6v-7h5.2v7" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.9 6.4h16.2M8.7 6.4V4.3a1.2 1.2 0 0 1 1.2-1.2h4.2a1.2 1.2 0 0 1 1.2 1.2v2.1" />
      <path d="M5.9 6.4l1 13.1a1.4 1.4 0 0 0 1.4 1.3h7.4a1.4 1.4 0 0 0 1.4-1.3l1-13.1" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8.6" y="8.6" width="11.8" height="11.8" rx="2.2" />
      <path d="M15.4 8.6V5.8a2.2 2.2 0 0 0-2.2-2.2H5.8a2.2 2.2 0 0 0-2.2 2.2v7.4a2.2 2.2 0 0 0 2.2 2.2h2.8" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.8 12.6l4.6 4.6L19.2 7.4" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 5.4 15.6 12 9 18.6" />
    </Icon>
  );
}
