set -x
EPATH=/Users/tinmarbook/Dev/momo/raspestrio/androidjs/serverdist

rm -rf $EPATH
mkdir $EPATH

cd ../Schedule
npm run buildForAndroid
cd ../server
# rm -r node_modules
npm run buildForAndroid

cp package.json $EPATH
cp package-lock.json $EPATH
cp -r node_modules $EPATH
cd $EPATH

# for small builds??
npm prune --production
npm install --omit=dev

rm package.json
# cp -r ./dist/android/* $EPATH
# cp -r ./node_modules $EPATH
