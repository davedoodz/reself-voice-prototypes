import { useDialKit } from 'dialkit';

/* A rectangle behind the phone, always centred on it (the stage centres the
   device, and this centres on the stage). Fill is a colour or any image in
   bg-images/. One shared panel ('Backdrop') across every prototype. */
const IMAGES = import.meta.glob('../bg-images/*.{png,jpg,jpeg,webp}', { eager: true, import: 'default' });
const imageOptions = Object.keys(IMAGES).map((p) => ({ value: p, label: p.split('/').pop().replace(/\.\w+$/, '') }));

const BACKDROP = {
  show: true,
  width: [520, 200, 1600, 1],
  height: [900, 200, 1400, 1],
  radius: [32, 0, 200, 1],
  fill: { type: 'select', options: [{ value: 'color', label: 'Colour' }, ...imageOptions], default: 'color' },
  color: '#eef1f4',
  /* Images: cover the rectangle, or fit inside it. */
  fit: { type: 'select', options: ['cover', 'contain'], default: 'cover' },
};

/* `defaults` overrides the starting values for one page (e.g. welcome). */
export function Backdrop({ defaults }) {
  const config = defaults
    ? {
        ...BACKDROP,
        width: [defaults.width, 200, 1600, 1],
        height: [defaults.height, 200, 1400, 1],
        radius: [defaults.radius, 0, 200, 1],
        fill: { ...BACKDROP.fill, default: defaults.fill },
        color: defaults.color,
      }
    : BACKDROP;
  const b = useDialKit('Backdrop', config, { id: defaults ? 'backdrop-welcome' : 'backdrop', defaultCollapsed: true });
  if (!b.show) return null;
  const image = b.fill !== 'color' && IMAGES[b.fill];
  return (
    <div
      className="backdrop"
      aria-hidden="true"
      style={{
        width: b.width,
        height: b.height,
        borderRadius: b.radius,
        background: image ? `${b.color} center / ${b.fit} no-repeat url("${image}")` : b.color,
      }}
    />
  );
}
