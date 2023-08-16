RCF="/home/pi/.bash_profile"
if [[ -f $RCF ]]; then
    echo "init pi"
    source $RCF
fi

#/home/pi/.local/share/pnpm/npm run run -- -c
NODE_BIN=$(which node)

sudo $NODE_BIN --experimental-modules --es-module-specifier-resolution=node out/index.js -c
