<?php
require '/home/paddnols/private/pd_mon_config.php';
$pdo = pd_pdo();

$pdo->query("UPDATE pd_counter SET hits = hits + 1 WHERE name = 'visits'");

$n = $pdo->query("SELECT hits FROM pd_counter WHERE name = 'visits'")->fetchColumn();
header('Content-Type: application/json');
echo json_encode(['visits' => (int)$n]);