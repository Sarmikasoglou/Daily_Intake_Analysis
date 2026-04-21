import "./globals.css";

export const metadata = {
  title: "Cow Intake and Body Weight Visualizer",
  description: "Upload intake and body-weight files, link EID to EART, and review cow trends.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
