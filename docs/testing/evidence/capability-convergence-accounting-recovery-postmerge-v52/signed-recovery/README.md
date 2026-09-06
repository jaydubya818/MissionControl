# Post-merge signed accounting recovery proof

This isolated loopback proof qualifies exact merged main commit
`b17c9c5c4d3c664a628ce43303e9794df603e3ca`.

All 74 scenarios passed: 57 retained observation/accounting scenarios, 15
signed settlement and recovery scenarios, and two real process kill/restart
scenarios. The proof used synthetic data and a disposable local database. It
made no provider or Production calls and does not establish real billing or
human acceptance.

Both backend port pairs closed. Generated signing values, databases, WAL/SHM
files, and storage were removed. Bound source files remained unchanged, and
generated values are absent from retained evidence.
