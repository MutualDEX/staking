import React, { useState, useEffect, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import Notify from 'containers/Notify';

import synthetix from 'lib/synthetix';

import { TabContainer } from '../../components/common';
import { Transaction } from 'constants/network';
import { normalizedGasPrice } from 'utils/network';

import { getGasEstimateForTransaction } from 'utils/transactions';

import useEscrowDataQuery from 'hooks/useEscrowDataQueryWrapper';
import { appReadyState } from 'store/app';
import { walletAddressState } from 'store/wallet';

import TabContent from './TabContent';

const MigrateTab = () => {
	const { monitorHash } = Notify.useContainer();
	const escrowDataQuery = useEscrowDataQuery();
	const claimableAmount = escrowDataQuery?.data?.claimableAmount ?? 0;
	const escrowData = escrowDataQuery?.data ?? null;
	const totalEscrowed = escrowData?.totalEscrowed ?? 0;
	const entryIds = useMemo(() => escrowData?.claimableEntryIdsInChunk ?? [], [escrowData]);

	const walletAddress = useRecoilValue(walletAddressState);
	const isAppReady = useRecoilValue(appReadyState);

	const [gasLimitEstimate, setGasLimitEstimate] = useState<number | null>(null);
	const [depositTxError, setMigrationTxError] = useState<string | null>(null);
	const [gasEstimateError, setGasEstimateError] = useState<string | null>(null);
	const [isVestNeeded, setIsVestNeeded] = useState<boolean>(false);
	const [gasPrice, setGasPrice] = useState<number>(0);
	const [transactionState, setTransactionState] = useState<Transaction>(Transaction.PRESUBMIT);
	const [txModalOpen, setTxModalOpen] = useState<boolean>(false);
	const [txHash, setTxHash] = useState<string | null>(null);

	useEffect(() => {
		if (claimableAmount) {
			setIsVestNeeded(true);
		}
	}, [claimableAmount]);

	useEffect(() => {
		const getGasLimitEstimate = async () => {
			if (walletAddress && isAppReady && entryIds && entryIds.length > 0) {
				try {
					setGasEstimateError(null);
					const {
						contracts: { SynthetixBridgeToOptimism },
					} = synthetix.js!;
					const gasEstimate = await getGasEstimateForTransaction(
						[entryIds],
						SynthetixBridgeToOptimism.estimateGas.initiateEscrowMigration
					);
					setGasLimitEstimate(gasEstimate);
				} catch (e) {
					console.log(e);
					setGasEstimateError(e.message);
				}
			}
		};
		getGasLimitEstimate();
		// eslint-disable-next-line
	}, [walletAddress, isAppReady, entryIds]);

	const handleMigration = async () => {
		if (isAppReady && !gasEstimateError) {
			const {
				contracts: { SynthetixBridgeToOptimism },
			} = synthetix.js!;
			try {
				setMigrationTxError(null);
				setTxModalOpen(true);

				const transaction = await SynthetixBridgeToOptimism.initiateEscrowMigration(entryIds, {
					gasLimit: gasLimitEstimate,
					gasPrice: normalizedGasPrice(gasPrice),
				});

				if (transaction) {
					setTxHash(transaction.hash);
					setTransactionState(Transaction.WAITING);
					monitorHash({
						txHash: transaction.hash,
						onTxConfirmed: () => {
							setTransactionState(Transaction.SUCCESS);
							escrowDataQuery.refetch();
						},
						onTxFailed: (txData) => {
							setTransactionState(Transaction.PRESUBMIT);
							setMigrationTxError(txData?.failureReason ?? null);
						},
					});
					setTxModalOpen(false);
				}
			} catch (e) {
				console.log(e);
				setMigrationTxError(e.message);
			}
		}
	};

	return (
		<TabContainer>
			<TabContent
				escrowedAmount={totalEscrowed}
				isVestNeeded={isVestNeeded}
				onSubmit={handleMigration}
				transactionError={depositTxError}
				gasEstimateError={gasEstimateError}
				txModalOpen={txModalOpen}
				setTxModalOpen={setTxModalOpen}
				gasLimitEstimate={gasLimitEstimate}
				setGasPrice={setGasPrice}
				txHash={txHash}
				transactionState={transactionState}
				setTransactionState={setTransactionState}
			/>
		</TabContainer>
	);
};

export default MigrateTab;
