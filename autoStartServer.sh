RCF="/home/pi/.bash_profile"
if [[ -f $RCF ]]; then
    echo "init pi"
    source $RCF
    SUDO=sudo
fi
#cd server
# npm run run -- --srv
NODE_BIN=$(which node)

$SUDO $NODE_BIN --experimental-modules --es-module-specifier-resolution=node out/index.js --srv -c
