import Image from "next/image";

export function ScenePhoto({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-[#e8eef0] shadow-[0_10px_28px_rgba(16,24,28,0.08)]">
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={900}
        className="h-40 w-full object-cover transition-transform duration-700 ease-out hover:scale-[1.04] sm:h-48 motion-reduce:transition-none"
      />
    </div>
  );
}

export function FeaturePhoto({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <div className="mx-auto aspect-[3/2] w-full max-w-[280px] overflow-hidden rounded-2xl bg-[#e8eef0] shadow-[0_8px_20px_rgba(16,24,28,0.08)]">
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={800}
        className="h-full w-full object-cover transition-transform duration-700 ease-out hover:scale-[1.04] motion-reduce:transition-none"
      />
    </div>
  );
}
