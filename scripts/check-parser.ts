// Quick sanity check for the link parser: `node scripts/check-parser.ts`
import { parseMediaUrl, guessNextEpisodeUrl, parentFolderUrl } from "../src/lib/parse.ts";

const samples = [
  "http://ftp12.circleftp.net/FILE/English%20%26%20Foreign%20TV%20Series/House%20%28TV%20Series%202004-2012%29/Season%202%201080p/house.s02e01.1080p.bluray.x264-shortbrehd.mkv",
  "http://ftp12.circleftp.net/FILE/English%20%26%20Foreign%20TV%20Series/House%20%28TV%20Series%202004-2012%29/",
  "http://ftp12.circleftp.net/FILE/English%20%26%20Foreign%20TV%20Series/House%20%28TV%20Series%202004-2012%29/Season%208%201080p/",
  "http://ftp7.circleftp.net/FILE/English%20Movies/2008/The%20Dark%20Knight%20%282008%29/The.Dark.Knight.2008.1080p.BluRay.x264.mkv",
  "http://example.net/Movies/Inception.2010.720p.WEB-DL.mp4",
  "http://example.net/TV/Breaking.Bad.S05E14.Ozymandias.720p.mkv",
  "Check this out http://example.net/Anime/One%20Piece/Season%201/05.mkv",
  "not a link",
];

for (const s of samples) {
  const r = parseMediaUrl(s);
  console.log(JSON.stringify(r, null, 0));
  if (r.kind === "episode") {
    console.log("  next →", guessNextEpisodeUrl(r.url));
    console.log("  folder →", parentFolderUrl(r.url));
  }
}
