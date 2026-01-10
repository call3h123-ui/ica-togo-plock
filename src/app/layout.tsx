import { VersionGate } from "./components/version-gate";

export const metadata = {
  title: "ICA ToGo Plock",
  description: "Intern beställning och plocklista",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #222;
            line-height: 1.5;
          }
          h1 {
            color: #E4002B;
            font-size: clamp(1.8em, 5vw, 2.5em);
            font-weight: 700;
            margin-bottom: 0.5em;
          }
          h2 {
            color: #E4002B;
            font-size: clamp(1.3em, 4vw, 1.8em);
            font-weight: 600;
            margin: 1.5em 0 0.5em 0;
          }
          h3 {
            color: #333;
            font-size: clamp(1em, 3vw, 1.2em);
            font-weight: 600;
          }
          button {
            background: linear-gradient(135deg, #E4002B, #C40024);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 20px;
            font-size: clamp(0.85em, 2vw, 1em);
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(228, 0, 43, 0.2);
            min-height: 44px;
          }
          button:hover {
            background: linear-gradient(135deg, #C40024, #a00020);
            box-shadow: 0 4px 16px rgba(228, 0, 43, 0.3);
            transform: translateY(-2px);
          }
          button:active {
            transform: translateY(0);
          }
          input, textarea, select {
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            padding: 10px 12px;
            font-family: inherit;
            font-size: clamp(0.9em, 2vw, 1em);
            transition: border-color 0.3s;
            min-height: 44px;
          }
          input:focus, textarea:focus, select:focus {
            outline: none;
            border-color: #E4002B;
            box-shadow: 0 0 0 3px rgba(228, 0, 43, 0.1);
          }
          
          @media (max-width: 640px) {
            body {
              padding: 0;
            }
            h1 {
              margin-bottom: 0.3em;
            }
            h2 {
              margin: 1.2em 0 0.4em 0;
            }
            button {
              padding: 10px 16px;
            }
            input, textarea, select {
              padding: 10px 10px;
            }
          }
        `}</style>
      </head>
      <body>
        <VersionGate>{children}</VersionGate>
      </body>
    </html>
  );
}
