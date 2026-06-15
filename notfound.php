<?php
require '/home/paddnols/private/pd_mon_config.php';
require __DIR__ . '/pd_log.php';
http_response_code(404);
pd_guard();
echo 'Not found';