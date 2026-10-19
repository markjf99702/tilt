# Tilt

**Tilt lives in Free Play now: [free-play.junkdrawer.works/tilt](https://free-play.junkdrawer.works/tilt/)**

Three pinball tables, now one of the machines in Free Play, the junkdrawer.works arcade, where every machine pays tickets into one pocket for one prize counter. Its code moved there too ([markjf99702/free-play](https://github.com/markjf99702/free-play), in `tilt/`), and that's the copy that changes from here on.

This repo keeps Tilt's old address, tilt.junkdrawer.works, working:

- `index.html` sends anyone who opens the old address (or a home-screen icon for it) on to Free Play, keeping anything after the address.
- `carry.html` hands Tilt's saves to Free Play the first time Free Play opens. A browser keeps each address's saves apart, so they're still here; it answers Free Play and nothing else, and removes nothing.
- `sw.js` replaces the old offline copy: it clears what that kept and steps aside, so an installed copy reaches the page that sends it on.

The rest of the files are the game as it was when it moved.
