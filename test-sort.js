const names = [
  "Brad Stuver",
  "Lionel Messi",
  "Stuu Smith",
  "Cristian Roldan",
  "Justin Stu",
  "Austin Stu",
  "Carlos Stuu"
];
const q = "stu";
const normalize = s => s.toLowerCase();

const matched = names.filter(n => normalize(n).includes(q));
matched.sort((a, b) => {
  const aName = normalize(a);
  const bName = normalize(b);
  const aStarts = aName.startsWith(q) || aName.includes(' ' + q) ? 1 : 0;
  const bStarts = bName.startsWith(q) || bName.includes(' ' + q) ? 1 : 0;
  return bStarts - aStarts;
});

console.log(matched);
