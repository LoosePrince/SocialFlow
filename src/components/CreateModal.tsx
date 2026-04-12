import React from 'react';
import { Modal } from 'antd';
import CreatePanel from './CreatePanel';

interface CreateModalProps {
  visible: boolean;
  onCancel: () => void;
}

const CreateModal: React.FC<CreateModalProps> = ({ visible, onCancel }) => {
  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={600}
      styles={{ body: { padding: '24px' } }}
      centered
      destroyOnHidden
    >
      {visible ? <CreatePanel variant="modal" onSuccess={onCancel} /> : null}
    </Modal>
  );
};

export default CreateModal;
