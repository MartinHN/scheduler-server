function do_for_sigint() {
    echo "signal interupted"
    sudo systemctl stop e32.service # avoid random locks (maybe)
    exit 1
}

RCF="/home/pi/.bash_profile"
if [[ -f $RCF ]]; then
    echo "init pi"
    source $RCF
    SUDO=sudo
    trap 'do_for_sigint' 2
fi
#cd server
# npm run run -- --srv

NODE=$(which node) # cause sudo will loose the path

$SUDO $NODE --unhandled-rejections=strict --experimental-modules --es-module-specifier-resolution=node out/index.js --srv -c
