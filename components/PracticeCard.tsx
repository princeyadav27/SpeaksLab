import Image from "next/image";
import Link from "next/link";

type PracticeCardProps = {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  href: string;
  objectPosition?: string;
};

export default function PracticeCard({
  title,
  description,
  image,
  imageAlt,
  href,
  objectPosition = "center",
}: PracticeCardProps) {
  return (
    <Link
      href={href}
      className="group flex h-[6.35rem] min-w-0 flex-1 items-center gap-3 rounded-[16px] border border-black/[0.08] bg-[#f7f0e1] p-[7px] pr-3.5 shadow-[0_1px_2px_rgba(20,24,40,0.05)] transition-transform duration-500 ease-out hover:-translate-y-0.5 focus-visible:outline-cobalt sm:h-[6.6rem] sm:max-w-[22.75rem]"
    >
      <div className="relative h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-[12px] sm:h-[5.7rem] sm:w-[5.7rem]">
        <Image
          src={image}
          alt={imageAlt}
          fill
          sizes="92px"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          style={{ objectPosition }}
        />
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <h3 className="font-display text-[1.15rem] leading-tight text-ink sm:text-[1.22rem]">
          {title}
        </h3>
        <p className="mt-1 whitespace-pre-line text-[11px] leading-[1.4] text-ink/65">
          {description}
        </p>
      </div>

      <span
        className="mb-1 mr-0.5 shrink-0 self-end text-[1.1rem] text-ink/50 transition-transform duration-300 group-hover:translate-x-1"
        aria-hidden="true"
      >
        →
      </span>
    </Link>
  );
}
