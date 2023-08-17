RCF="/home/pi/.bash_profile"
if [[ -f $RCF ]]; then
    echo "init pi"
    source $RCF
    SUDO=sudo
fi

#/home/pi/.local/share/pnpm/npm run run -- -c

$SUDO node --unhandled-rejections=strict --experimental-modules --es-module-specifier-resolution=node out/index.js -c
