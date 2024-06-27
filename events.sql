create temp table events as
select  t::timestamp as t, * from read_json_auto('./events.jsonl');

select e, s, count(*) from events group by e, s  order by count(*) desc;

select 
  min(n)::decimal(8, 1) as min,
  max(n)::decimal(8, 1) as min,
  avg(n)::decimal(8, 1) as avg,
  stddev_samp(n)::decimal(8, 1) as stddev,
from events where e = 'Time' and s = 'eth_sendRawTransaction';


select
  newBlock.blockNumber as block_number,
  newBlock.t as rpc_time,
  blockData.blockTimestamp as block_time,
  sendTx.n as broadcast_duration
from events newBlock, events blockData, events sendTx
where
  newBlock.e = 'NewBlock'
  and blockData.e = 'NewBlockData' 
  and newBlock.blockNumber = blockData.blockNumber 

  and sendTx.e = 'Time' and sendTx.s = 'eth_sendRawTransaction'
  and list_contains(blockData.blockTransactions, sendTx.txHash)

