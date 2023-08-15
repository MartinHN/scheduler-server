RCF="/home/pi/.bash_profile"
if [[ -f $RCF ]]; then
    echo "init pi"
    source $RCF
fi

#/home/pi/.local/share/pnpm/npm run run -- -c
sudo node --experimental-modules --es-module-specifier-resolution=node out/index.js -c
