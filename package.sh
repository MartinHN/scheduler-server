EPATH=/home/tinmar/Dev/raspestrio/androidjs/serverdist

rm -r node_modules
# pnpm i --prod
npm install --only=prod
npm run buildForAndroid

rm -r $EPATH
mkdir $EPATH
cp -r ./out $EPATH
cp -r ./node_modules $EPATH
cp -r ../view-dist $EPATH
