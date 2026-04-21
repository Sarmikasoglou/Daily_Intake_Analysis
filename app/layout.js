import "./globals.css";

export const metadata = {
  title: "Intake Plotter",
  description: "Upload CSV intake files and plot daily, range, and weekly summaries.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
