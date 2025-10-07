#!/bin/bash
echo "📱 Applying mobile-friendly fixes..."

# Backup
cp src/index.css src/index.css.backup 2>/dev/null
echo "✓ Backed up files"

# Update index.css
cat > src/index.css << 'EOFCSS'
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  padding: 0;
  overflow-x: hidden !important;
  width: 100%;
  max-width: 100vw;
}

#root {
  min-height: 100vh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
}

input, textarea, select, button {
  font-size: 16px;
}

@media (max-width: 640px) {
  html { font-size: 14px; }
  h1 { font-size: 1.5rem !important; }
  h2 { font-size: 1.25rem !important; }
  .p-4 { padding: 0.75rem !important; }
  .p-6 { padding: 1rem !important; }
}

button, .btn {
  min-height: 44px;
  min-width: 44px;
}
EOFCSS
