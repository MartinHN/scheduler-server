RCF="/home/pi/.bash_profile"
if [[ -f $RCF ]]; then
    echo "init pi"
    source $RCF
fi
#cd server
# npm run run -- --srv
node --experimental-modules --es-module-specifier-resolution=node out/index.js --srv
