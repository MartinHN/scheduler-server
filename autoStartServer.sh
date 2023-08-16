RCF="/home/pi/.bash_profile"
if [[ -f $RCF ]]; then
    echo "init pi"
    source $RCF
fi
#cd server
# npm run run -- --srv
NODE_BIN=$(which node)

sudo $NODE_BIN --experimental-modules --es-module-specifier-resolution=node out/index.js --srv -c
