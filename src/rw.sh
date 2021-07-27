#!/bin/bash

# shopt -s expand_aliases
# source /home/pi/.bash_profile
sudo mount -o remount,"$1" /
sudo mount -o remount,"$1" /boot
# ro=""
# rw="sudo mount -o remount,rw / ; sudo mount -o remount,rw /boot :"

# echo "$1"
# if [[ "$1" ]]; then
#     echo 'allowing write'
#     $rw
# else
#     echo 'disabling write'
#     $ro
# fi
# # rw
