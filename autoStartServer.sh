RCF="/home/pi/.bash_profile"
if [[ -f $RCF ]]; then
    echo "init pi"
    source $RCF
    SUDO=sudo
fi
#cd server
# npm run run -- --srv

function do_for_sigint() {
 sudo systemctl stop e32.service # avoid random locks (maybe)
 exit()
}

trap 'do_for_sigint' 2
NODE=$(which node) # cause sudo will loose the path

$SUDO $NODE --unhandled-rejections=strict --experimental-modules --es-module-specifier-resolution=node out/index.js --srv -c
