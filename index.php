<?php
require '/home/paddnols/private/pd_mon_config.php';
require __DIR__ . '/pd_log.php';

pd_guard();
readfile(__DIR__ . '/pd_main.html');