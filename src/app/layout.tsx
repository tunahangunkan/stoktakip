export const metadata = {
  title: 'Stok Paneli — Organik Gurme',
  description: 'Çok kanallı stok senkron paneli',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
