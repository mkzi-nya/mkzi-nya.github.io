cp -u -r "$(dirname "$0")/webdocs" ~/
cd ~/webdocs
pnpm run docs:build
rm -rf "$(dirname "$0")"/assets
cp -r ~/webdocs/docs/.vitepress/dist/* "$(dirname "$0")"/
cd "$(dirname "$0")"
