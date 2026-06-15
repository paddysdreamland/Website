<?php
require '/home/paddnols/private/pd_mon_config.php';
require __DIR__ . '/pd_log.php';
pd_guard();                          // blocklist + log + burst check
readfile(__DIR__ . '/pd_main.html'); // your page, untouched