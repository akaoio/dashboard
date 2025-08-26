#!/bin/sh

# Quick build script for dashboard
echo "Building @akaoio/dashboard..."

# Create dist directory
mkdir -p dist

# Copy TypeScript files as JavaScript (quick hack for now)
for file in src/*.ts; do
  basename=$(basename "$file" .ts)
  
  # Simple transpilation - remove type annotations
  sed 's/: [^=,;)]*//g; s/import type/import/g; s/export type/export/g; s/<[^>]*>//g' "$file" > "dist/$basename.js"
  
  # Fix imports
  sed -i 's/\.ts"/\.js"/g' "dist/$basename.js"
  sed -i "s/\.ts'/\.js'/g" "dist/$basename.js"
done

# Create index.mjs for ES modules
cp dist/index.js dist/index.mjs

echo "✅ Build complete!"